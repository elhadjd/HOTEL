import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { jsonError, requireTenant } from "@/server/api-auth";

export type LiveAlertItem = {
  id: string;
  severity: "info" | "warning" | "danger";
  title: string;
  body: string;
  href: string;
  count: number;
};

const patchSchema = z.union([
  z.object({ markAllRead: z.literal(true) }),
  z.object({ id: z.string().min(1) }),
]);

export async function GET() {
  const authz = await requireTenant();
  if (!authz.ok) return authz.response;

  const { institutionId, userId } = authz.ctx;
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

  try {
    const [
      notifications,
      unreadDbCount,
      arrivalsTodayCount,
      overdueReservationsCount,
      departuresDueCount,
      urgentHousekeepingCount,
      criticalMaintenanceCount,
      pendingGuestMappingsCount,
    ] = await Promise.all([
      prisma.notification.findMany({
        where: {
          institutionId,
          OR: [{ userId: null }, { userId }],
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      prisma.notification.count({
        where: {
          institutionId,
          readAt: null,
          OR: [{ userId: null }, { userId }],
        },
      }),
      prisma.reservation.count({
        where: {
          institutionId,
          status: { in: ["CONFIRMED", "PENDING"] },
          arrivalDate: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      prisma.reservation.count({
        where: {
          institutionId,
          status: { in: ["DRAFT", "PENDING", "CONFIRMED"] },
          departureDate: { lt: todayStart },
        },
      }),
      prisma.stay.count({
        where: {
          institutionId,
          status: { in: ["ACTIVE", "CHECKOUT_PENDING"] },
          expectedDeparture: { lt: tomorrowStart },
        },
      }),
      prisma.housekeepingTask.count({
        where: {
          hotel: { institutionId },
          priority: { in: ["HIGH", "URGENT"] },
          status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] },
        },
      }),
      prisma.maintenanceRequest.count({
        where: {
          hotel: { institutionId },
          priority: { in: ["HIGH", "CRITICAL"] },
          status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
        },
      }),
      prisma.guestCustomerMapping.count({
        where: {
          institutionId,
          syncStatus: "NEEDS_RESOLUTION",
        },
      }),
    ]);

    const alerts: LiveAlertItem[] = [];

    if (overdueReservationsCount > 0) {
      alerts.push({
        id: "overdue-reservations",
        severity: "danger",
        title: `${overdueReservationsCount} reserva(s) expirada(s) / em atraso`,
        body: "Verifique para marcar No-Show, reagendar ou libertar o quarto.",
        href: "/reservations",
        count: overdueReservationsCount,
      });
    }

    if (arrivalsTodayCount > 0) {
      alerts.push({
        id: "arrivals-today",
        severity: "info",
        title: `${arrivalsTodayCount} chegada(s) prevista(s) hoje`,
        body: "Reservas prontas para check-in na recepção.",
        href: "/check-in",
        count: arrivalsTodayCount,
      });
    }

    if (departuresDueCount > 0) {
      alerts.push({
        id: "departures-due",
        severity: "warning",
        title: `${departuresDueCount} partida(s) prevista(s) hoje ou em atraso`,
        body: "Estadias activas aguardando encerramento e check-out.",
        href: "/check-out",
        count: departuresDueCount,
      });
    }

    if (criticalMaintenanceCount > 0) {
      alerts.push({
        id: "critical-maintenance",
        severity: "danger",
        title: `${criticalMaintenanceCount} pedido(s) de manutenção prioritário(s)`,
        body: "Ocorrências de prioridade alta ou crítica em aberto.",
        href: "/maintenance/operations",
        count: criticalMaintenanceCount,
      });
    }

    if (urgentHousekeepingCount > 0) {
      alerts.push({
        id: "urgent-housekeeping",
        severity: "warning",
        title: `${urgentHousekeepingCount} tarefa(s) urgente(s) de governança`,
        body: "Quartos com limpeza ou inspecção prioritária pendente.",
        href: "/housekeeping/operations",
        count: urgentHousekeepingCount,
      });
    }

    if (pendingGuestMappingsCount > 0) {
      alerts.push({
        id: "pending-guest-mappings",
        severity: "warning",
        title: `${pendingGuestMappingsCount} hóspede(s) sem cliente central associado`,
        body: "Resolva a ligação antes de emitir reservas ou faturas.",
        href: "/guests",
        count: pendingGuestMappingsCount,
      });
    }

    return NextResponse.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
      alerts,
      unreadCount: unreadDbCount,
      badgeCount: unreadDbCount + alerts.length,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request) {
  const authz = await requireTenant();
  if (!authz.ok) return authz.response;

  const { institutionId, userId } = authz.ctx;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
  }

  try {
    const now = new Date();
    if ("markAllRead" in parsed.data) {
      await prisma.notification.updateMany({
        where: {
          institutionId,
          readAt: null,
          OR: [{ userId: null }, { userId }],
        },
        data: { readAt: now },
      });
      return NextResponse.json({ ok: true });
    }

    await prisma.notification.updateMany({
      where: {
        id: parsed.data.id,
        institutionId,
        OR: [{ userId: null }, { userId }],
      },
      data: { readAt: now },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
