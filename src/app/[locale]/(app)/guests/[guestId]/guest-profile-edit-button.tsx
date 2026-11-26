"use client";

import { useState } from "react";
import { Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuestFormDrawer, type GuestDTO } from "../guest-form-drawer";

export function GuestProfileEditButton({ guest }: { guest: GuestDTO }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Edit3 className="h-3.5 w-3.5" />
          Editar perfil completo
        </Button>
        {info ? <span className="text-xs font-medium text-teal-800">{info}</span> : null}
      </div>
      <GuestFormDrawer
        open={open}
        onClose={() => setOpen(false)}
        editingGuest={guest}
        onSaved={(msg) => setInfo(msg)}
      />
    </>
  );
}
