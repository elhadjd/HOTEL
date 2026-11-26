"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDrawer } from "@/components/ui/form-drawer";

export type GuestDocumentDTO = {
  id?: string;
  type: string;
  reference: string;
  issuingCountry?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
};

export type GuestDTO = {
  id: string;
  salutation?: string | null;
  firstName: string;
  lastName: string;
  customerType?: string | null;
  companyName?: string | null;
  nif?: string | null;
  email?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  nationality?: string | null;
  preferredLanguage?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  country?: string | null;
  vipTier?: string | null;
  dietaryRestrictions?: string | null;
  roomPreferences?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  marketingOptIn?: boolean;
  notes?: string | null;
  documents?: GuestDocumentDTO[];
  customerMapping?: {
    syncStatus: string;
    externalCustomerId: string | null;
  } | null;
};

type CentralCustomerHit = {
  id: number;
  name: string;
  surname?: string | null;
  full_name?: string | null;
  customer_type?: string | null;
  email?: string | null;
  phone?: string | null;
  nif?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  country?: { id: number; name?: string | null } | null;
};

type GuestFormState = {
  salutation: string;
  firstName: string;
  lastName: string;
  customerType: "individual" | "company";
  companyName: string;
  nif: string;
  email: string;
  phone: string;
  secondaryPhone: string;
  birthDate: string;
  gender: string;
  nationality: string;
  preferredLanguage: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  vipTier: string;
  dietaryRestrictions: string;
  roomPreferences: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  marketingOptIn: boolean;
  notes: string;
  // Identity document
  docType: string;
  docReference: string;
  docIssuingCountry: string;
  docIssuedAt: string;
  docExpiresAt: string;
  // Optional central-only commercial fields
  customerCode: string;
  creditLimit: string;
  sponsorCode: string;
  reference: string;
  syncToCentral: boolean;
};

function emptyGuestForm(): GuestFormState {
  return {
    salutation: "",
    firstName: "",
    lastName: "",
    customerType: "individual",
    companyName: "",
    nif: "",
    email: "",
    phone: "",
    secondaryPhone: "",
    birthDate: "",
    gender: "",
    nationality: "Angolana",
    preferredLanguage: "pt",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    country: "Angola",
    vipTier: "STANDARD",
    dietaryRestrictions: "",
    roomPreferences: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    marketingOptIn: false,
    notes: "",
    docType: "BI",
    docReference: "",
    docIssuingCountry: "Angola",
    docIssuedAt: "",
    docExpiresAt: "",
    customerCode: "",
    creditLimit: "",
    sponsorCode: "",
    reference: "",
    syncToCentral: true,
  };
}

function guestToForm(g: GuestDTO): GuestFormState {
  const doc = g.documents?.[0];
  return {
    salutation: g.salutation ?? "",
    firstName: g.firstName ?? "",
    lastName: g.lastName ?? "",
    customerType: g.customerType === "company" ? "company" : "individual",
    companyName: g.companyName ?? "",
    nif: g.nif ?? "",
    email: g.email ?? "",
    phone: g.phone ?? "",
    secondaryPhone: g.secondaryPhone ?? "",
    birthDate: g.birthDate ? g.birthDate.slice(0, 10) : "",
    gender: g.gender ?? "",
    nationality: g.nationality ?? "",
    preferredLanguage: g.preferredLanguage ?? "pt",
    address: g.address ?? "",
    city: g.city ?? "",
    province: g.province ?? "",
    postalCode: g.postalCode ?? "",
    country: g.country ?? "",
    vipTier: g.vipTier ?? "STANDARD",
    dietaryRestrictions: g.dietaryRestrictions ?? "",
    roomPreferences: g.roomPreferences ?? "",
    emergencyContactName: g.emergencyContactName ?? "",
    emergencyContactPhone: g.emergencyContactPhone ?? "",
    marketingOptIn: Boolean(g.marketingOptIn),
    notes: g.notes ?? "",
    docType: doc?.type ?? "BI",
    docReference: doc?.reference ?? "",
    docIssuingCountry: doc?.issuingCountry ?? "",
    docIssuedAt: doc?.issuedAt ? doc.issuedAt.slice(0, 10) : "",
    docExpiresAt: doc?.expiresAt ? doc.expiresAt.slice(0, 10) : "",
    customerCode: "",
    creditLimit: "",
    sponsorCode: "",
    reference: "",
    syncToCentral: Boolean(g.customerMapping?.externalCustomerId),
  };
}

export function GuestFormDrawer({
  open,
  onClose,
  editingGuest,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editingGuest?: GuestDTO | null;
  onSaved?: (message: string) => void;
}) {
  const router = useRouter();
  const isEditing = Boolean(editingGuest);

  const [mode, setMode] = useState<"new_customer" | "existing_customer">("new_customer");
  const [form, setForm] = useState<GuestFormState>(emptyGuestForm);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CentralCustomerHit[]>([]);
  const [centralCustomerId, setCentralCustomerId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editingGuest) {
      setForm(guestToForm(editingGuest));
    } else {
      setMode("new_customer");
      setForm(emptyGuestForm());
      setQ("");
      setHits([]);
      setCentralCustomerId(null);
    }
  }, [open, editingGuest]);

  function searchCustomers() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/v1/integrations/sigesc/customers?search=${encodeURIComponent(q)}&per_page=10`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao pesquisar clientes centrais");
        return;
      }
      setHits((data.data ?? []) as CentralCustomerHit[]);
    });
  }

  function applyCentralHit(c: CentralCustomerHit) {
    setCentralCustomerId(c.id);
    setForm((prev) => ({
      ...prev,
      firstName: c.name || prev.firstName,
      lastName: c.surname ?? prev.lastName,
      customerType: c.customer_type === "company" ? "company" : "individual",
      companyName: c.customer_type === "company" ? c.name : prev.companyName,
      email: c.email ?? prev.email,
      phone: c.phone ?? prev.phone,
      nif: c.nif ?? prev.nif,
      address: c.address ?? prev.address,
      city: c.city ?? prev.city,
      province: c.province ?? prev.province,
      country: c.country?.name ?? prev.country,
      birthDate: c.birth_date ? c.birth_date.slice(0, 10) : prev.birthDate,
      gender: c.sex ?? prev.gender,
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isEditing && mode === "existing_customer" && !centralCustomerId) {
      setError("Seleccione um cliente central existente ou mude para 'Criar cliente + hóspede'.");
      return;
    }

    const creditNum = form.creditLimit.trim() ? Number(form.creditLimit) : null;
    const document = form.docReference.trim()
      ? {
          type: form.docType || "BI",
          reference: form.docReference.trim(),
          issuingCountry: form.docIssuingCountry.trim() || null,
          issuedAt: form.docIssuedAt.trim() || null,
          expiresAt: form.docExpiresAt.trim() || null,
        }
      : null;

    const sharedFields = {
      salutation: form.salutation.trim() || null,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      customerType: form.customerType,
      companyName: form.companyName.trim() || null,
      nif: form.nif.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      secondaryPhone: form.secondaryPhone.trim() || null,
      birthDate: form.birthDate.trim() || null,
      gender: form.gender.trim() || null,
      nationality: form.nationality.trim() || null,
      preferredLanguage: form.preferredLanguage.trim() || null,
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      province: form.province.trim() || null,
      postalCode: form.postalCode.trim() || null,
      country: form.country.trim() || null,
      vipTier: form.vipTier || "STANDARD",
      dietaryRestrictions: form.dietaryRestrictions.trim() || null,
      roomPreferences: form.roomPreferences.trim() || null,
      emergencyContactName: form.emergencyContactName.trim() || null,
      emergencyContactPhone: form.emergencyContactPhone.trim() || null,
      marketingOptIn: form.marketingOptIn,
      notes: form.notes.trim() || null,
      document,
    };

    startTransition(async () => {
      if (isEditing && editingGuest) {
        const res = await fetch(`/api/v1/guests/${editingGuest.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...sharedFields,
            syncToCentral: form.syncToCentral,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Falha ao actualizar hóspede");
          return;
        }
        const msg = data.centralSyncWarning
          ? `Hóspede actualizado localmente (aviso central: ${data.centralSyncWarning}).`
          : data.centralSynced
            ? "Perfil do hóspede actualizado no hotel e no sistema central."
            : "Perfil do hóspede actualizado.";
        onSaved?.(msg);
        onClose();
        router.refresh();
        return;
      }

      const body =
        mode === "existing_customer"
          ? {
              mode,
              centralCustomerId,
              ...sharedFields,
            }
          : {
              mode,
              ...sharedFields,
              customerCode: form.customerCode.trim() || null,
              creditLimit:
                creditNum !== null && Number.isFinite(creditNum) && creditNum >= 0
                  ? creditNum
                  : null,
              sponsorCode: form.sponsorCode.trim() || null,
              reference: form.reference.trim() || null,
            };

      const res = await fetch("/api/v1/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Falha ao registar hóspede");
        return;
      }
      onSaved?.(`Hóspede "${form.firstName} ${form.lastName}" registado com sucesso.`);
      onClose();
      router.refresh();
    });
  }

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      eyebrow="Ficha Completa de Hóspede & Cliente"
      title={
        isEditing
          ? `Editar ${editingGuest?.firstName ?? ""} ${editingGuest?.lastName ?? ""}`.trim()
          : "Novo hóspede"
      }
      subtitle="Todos os dados aceites pelo Sistema Central e informações operacionais relevantes para hotelaria."
      size="xl"
      onSubmit={onSubmit}
      footer={
        <div className="space-y-2.5">
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {isEditing && editingGuest?.customerMapping?.externalCustomerId ? (
              <label className="flex items-center gap-2 text-xs font-medium text-ink-900">
                <input
                  type="checkbox"
                  checked={form.syncToCentral}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, syncToCentral: e.target.checked }))
                  }
                  className="h-4 w-4 accent-teal-600"
                />
                Sincronizar alterações fiscais e de contacto com o Sistema Central (#
                {editingGuest.customerMapping.externalCustomerId})
              </label>
            ) : (
              <span className="text-xs text-stone-500">
                Campos marcados com * são obrigatórios.
              </span>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "A guardar…"
                  : isEditing
                    ? "Guardar perfil do hóspede"
                    : mode === "new_customer"
                      ? "Criar cliente central + hóspede"
                      : "Associar e criar hóspede"}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-sm">
        {/* Creation Mode Switch */}
        {!isEditing ? (
          <section className="surface space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  mode === "new_customer"
                    ? "bg-ink-900 text-white shadow-sm"
                    : "bg-sand-100 text-stone-700 hover:bg-sand-200"
                }`}
                onClick={() => setMode("new_customer")}
              >
                Criar cliente central + hóspede
              </button>
              <button
                type="button"
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                  mode === "existing_customer"
                    ? "bg-ink-900 text-white shadow-sm"
                    : "bg-sand-100 text-stone-700 hover:bg-sand-200"
                }`}
                onClick={() => setMode("existing_customer")}
              >
                Associar a cliente central existente
              </button>
            </div>

            {mode === "existing_customer" ? (
              <div className="space-y-2.5 pt-1">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          searchCustomers();
                        }
                      }}
                      placeholder="Pesquisar cliente no sistema central (nome, NIF, email, telefone)…"
                      className="h-10 w-full rounded-md border border-sand-200 bg-white pl-9 pr-3 text-sm"
                    />
                  </div>
                  <Button type="button" variant="secondary" disabled={pending} onClick={searchCustomers}>
                    Pesquisar
                  </Button>
                </div>

                {hits.length > 0 ? (
                  <ul className="max-h-44 divide-y divide-sand-100 overflow-auto rounded-lg border border-sand-200 bg-white">
                    {hits.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition ${
                            centralCustomerId === c.id
                              ? "bg-teal-50 font-medium text-teal-900"
                              : "hover:bg-sand-50"
                          }`}
                          onClick={() => applyCentralHit(c)}
                        >
                          <div>
                            <p className="font-medium text-ink-900">
                              {c.full_name ?? `${c.name} ${c.surname ?? ""}`.trim()}
                            </p>
                            <p className="text-stone-500">
                              {[c.nif ? `NIF ${c.nif}` : null, c.email, c.phone, c.city]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <span className="font-mono text-stone-400">#{c.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {centralCustomerId ? (
                  <p className="rounded-md bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800">
                    Cliente central seleccionado: #{centralCustomerId} (campos preenchidos
                    automaticamente)
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Section 1: Identity & Fiscal */}
        <section className="surface space-y-4 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            1. Identificação Pessoal e Fiscal
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-stone-600">Tipo de cliente</span>
              <select
                value={form.customerType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    customerType: e.target.value as "individual" | "company",
                  }))
                }
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              >
                <option value="individual">Individual (Particular)</option>
                <option value="company">Empresa / Corporativo</option>
              </select>
            </label>
            <label className="block">
              <span className="text-stone-600">Tratamento</span>
              <select
                value={form.salutation}
                onChange={(e) => setForm((f) => ({ ...f, salutation: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              >
                <option value="">—</option>
                <option value="Sr.">Sr.</option>
                <option value="Sra.">Sra.</option>
                <option value="Dr.">Dr.</option>
                <option value="Dra.">Dra.</option>
                <option value="Eng.">Eng.</option>
                <option value="Exmo.">Exmo.</option>
              </select>
            </label>
            <label className="block">
              <span className="text-stone-600">NIF / N.º Contribuinte</span>
              <input
                value={form.nif}
                onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
                placeholder="Ex.: 004512345LA042"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
              />
            </label>

            <label className="block sm:col-span-1">
              <span className="text-stone-600">Nome próprio *</span>
              <input
                required={isEditing || mode === "new_customer"}
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                placeholder="Ex.: António"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-stone-600">Apelido / Sobrenome *</span>
              <input
                required={isEditing || mode === "new_customer"}
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                placeholder="Ex.: Mendes dos Santos"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="text-stone-600">Empresa / Entidade (faturação ou viagem de negócios)</span>
              <input
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                placeholder="Opcional — Ex.: BFA, Sonangol, Agência..."
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Género</span>
              <select
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              >
                <option value="">Não especificado</option>
                <option value="male">Masculino</option>
                <option value="female">Feminino</option>
                <option value="other">Outro</option>
              </select>
            </label>

            <label className="block">
              <span className="text-stone-600">Data de nascimento</span>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Nacionalidade</span>
              <input
                value={form.nationality}
                onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
                placeholder="Ex.: Angolana, Portuguesa…"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Idioma preferido</span>
              <select
                value={form.preferredLanguage}
                onChange={(e) => setForm((f) => ({ ...f, preferredLanguage: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              >
                <option value="pt">Português</option>
                <option value="en">Inglês</option>
                <option value="fr">Francês</option>
                <option value="es">Espanhol</option>
              </select>
            </label>
          </div>
        </section>

        {/* Section 2: Identity Document (Hospitality / Check-in / SME) */}
        <section className="surface space-y-4 p-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
              2. Documento de Identificação (Check-in / Hotelaria)
            </h4>
            <p className="mt-0.5 text-xs text-stone-500">
              Essencial para ficha de alojamento, check-in expresso e registo obrigatório de hóspedes.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-stone-600">Tipo de documento</span>
              <select
                value={form.docType}
                onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              >
                <option value="BI">Bilhete de Identidade (BI)</option>
                <option value="PASSPORT">Passaporte</option>
                <option value="RESIDENCE_CARD">Cartão de Residência</option>
                <option value="DRIVERS_LICENSE">Carta de Condução</option>
                <option value="OTHER">Outro</option>
              </select>
            </label>
            <label className="block">
              <span className="text-stone-600">Número do documento</span>
              <input
                value={form.docReference}
                onChange={(e) => setForm((f) => ({ ...f, docReference: e.target.value }))}
                placeholder="Ex.: 004512345LA042 / N123456"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">País emissor</span>
              <input
                value={form.docIssuingCountry}
                onChange={(e) => setForm((f) => ({ ...f, docIssuingCountry: e.target.value }))}
                placeholder="Ex.: Angola"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Data de emissão</span>
              <input
                type="date"
                value={form.docIssuedAt}
                onChange={(e) => setForm((f) => ({ ...f, docIssuedAt: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Data de validade</span>
              <input
                type="date"
                value={form.docExpiresAt}
                onChange={(e) => setForm((f) => ({ ...f, docExpiresAt: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
              />
            </label>
          </div>
        </section>

        {/* Section 3: Contacts & Address */}
        <section className="surface space-y-4 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            3. Contactos e Morada
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-stone-600">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="hospede@email.com"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Telefone principal</span>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+244 9XX XXX XXX"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Telefone secundário / WhatsApp</span>
              <input
                value={form.secondaryPhone}
                onChange={(e) => setForm((f) => ({ ...f, secondaryPhone: e.target.value }))}
                placeholder="Opcional"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block sm:col-span-3">
              <span className="text-stone-600">Morada / Endereço completo</span>
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Rua, Bairro, Edifício, N.º"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Cidade / Município</span>
              <input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                placeholder="Ex.: Luanda"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Província / Estado</span>
              <input
                value={form.province}
                onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))}
                placeholder="Ex.: Luanda"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">País de residência</span>
              <input
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                placeholder="Ex.: Angola"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Código postal</span>
              <input
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                placeholder="Opcional"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
          </div>
        </section>

        {/* Section 4: Hospitality Profile, Preferences & Emergency Contact */}
        <section className="surface space-y-4 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
            4. Perfil Hoteleiro, Preferências e Emergência
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-stone-600">Nível / Categoria VIP</span>
              <select
                value={form.vipTier}
                onChange={(e) => setForm((f) => ({ ...f, vipTier: e.target.value }))}
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              >
                <option value="STANDARD">Standard</option>
                <option value="SILVER">Silver</option>
                <option value="GOLD">Gold</option>
                <option value="PLATINUM">Platinum</option>
                <option value="VIP">VIP Executivo</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-stone-600">Preferências de quarto</span>
              <input
                value={form.roomPreferences}
                onChange={(e) => setForm((f) => ({ ...f, roomPreferences: e.target.value }))}
                placeholder="Ex.: Andar alto, cama King, não fumador, almofada hipoalergénica…"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block sm:col-span-3">
              <span className="text-stone-600">Restrições alimentares / Alergias</span>
              <input
                value={form.dietaryRestrictions}
                onChange={(e) => setForm((f) => ({ ...f, dietaryRestrictions: e.target.value }))}
                placeholder="Ex.: Sem glúten, vegetariano, alergia a marisco…"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-stone-600">Contacto de emergência (nome)</span>
              <input
                value={form.emergencyContactName}
                onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))}
                placeholder="Nome de familiar ou responsável"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Telefone de emergência</span>
              <input
                value={form.emergencyContactPhone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, emergencyContactPhone: e.target.value }))
                }
                placeholder="+244 9XX XXX XXX"
                className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3"
              />
            </label>
            <label className="block sm:col-span-3">
              <span className="text-stone-600">Observações internas da receção</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notas privadas da equipa de receção e concierge…"
                className="mt-1 w-full rounded-md border border-sand-200 bg-white px-3 py-2"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-900">
            <input
              type="checkbox"
              checked={form.marketingOptIn}
              onChange={(e) => setForm((f) => ({ ...f, marketingOptIn: e.target.checked }))}
              className="h-4 w-4 accent-teal-600"
            />
            Autoriza receber comunicações, promoções e convites do hotel
          </label>
        </section>

        {/* Section 5: Optional Central Commercial Fields (new_customer creation) */}
        {!isEditing && mode === "new_customer" ? (
          <section className="surface space-y-4 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              5. Dados Comerciais do Sistema Central (opcional)
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-stone-600">Código de cliente</span>
                <input
                  value={form.customerCode}
                  onChange={(e) => setForm((f) => ({ ...f, customerCode: e.target.value }))}
                  placeholder="Gerado automaticamente se vazio"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Limite de crédito (AOA)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.creditLimit}
                  onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 tabular-nums"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Referência interna</span>
                <input
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder="Opcional"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>
              <label className="block">
                <span className="text-stone-600">Código de patrocinador / indicação</span>
                <input
                  value={form.sponsorCode}
                  onChange={(e) => setForm((f) => ({ ...f, sponsorCode: e.target.value }))}
                  placeholder="Opcional"
                  className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 font-mono"
                />
              </label>
            </div>
          </section>
        ) : null}
      </div>
    </FormDrawer>
  );
}
