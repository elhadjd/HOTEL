"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function ReservationActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(path: string) {
    startTransition(async () => {
      await fetch(`/api/v1/reservations/${id}/${path}`, { method: "POST" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {["DRAFT", "PENDING"].includes(status) ? (
        <Button size="sm" disabled={pending} onClick={() => act("confirm")}>
          Confirmar
        </Button>
      ) : null}
      {!["CANCELLED", "CHECKED_OUT", "CHECKED_IN"].includes(status) ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act("cancel")}>
          Cancelar
        </Button>
      ) : null}
    </div>
  );
}
