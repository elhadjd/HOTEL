import type { EmailTemplateKind } from "@prisma/client";

export type TemplateRenderInput = {
  toName?: string;
  appUrl: string;
  locale?: string;
  /** One-time secret already decrypted by dispatcher — never logged */
  secret?: string;
  resetPath?: string;
  institutionName?: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function shell(title: string, bodyHtml: string, bodyText: string): RenderedEmail {
  const html = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f7f5f1;font-family:Georgia,'Times New Roman',serif;color:#111a2e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f5f1;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2dbd0;border-radius:10px;overflow:hidden;">
        <tr><td style="background:#111a2e;padding:24px 28px;">
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#9db0cc;">SIGESC</div>
          <div style="font-size:26px;font-weight:700;color:#ffffff;margin-top:4px;">Hotelaria</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;">${title}</h1>
          ${bodyHtml}
          <p style="margin:28px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#6f675e;line-height:1.5;">
            Modern Hospitality Intelligence · Este email foi enviado automaticamente. Não responda com credenciais.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `SIGESC Hotelaria\n\n${title}\n\n${bodyText}\n\n— SIGESC Hotelaria`;
  return { subject: `SIGESC Hotelaria — ${title}`, html, text };
}

export function renderEmailTemplate(
  kind: EmailTemplateKind,
  input: TemplateRenderInput,
): RenderedEmail {
  const name = input.toName || "Administrador";
  const institution = input.institutionName || "a sua instituição";
  const appUrl = input.appUrl.replace(/\/$/, "");

  switch (kind) {
    case "ONBOARDING_TEMP_PASSWORD": {
      const secret = input.secret ?? "";
      return shell(
        "Conta institucional criada",
        `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3a34;">Olá ${escapeHtml(name)},</p>
         <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3a34;">
           A conta SIGESC Hotelaria para <strong>${escapeHtml(institution)}</strong> foi criada com sucesso.
           Utilize a palavra-passe temporária abaixo no primeiro acesso. Será obrigado a definir uma nova palavra-passe.
         </p>
         <p style="font-family:Consolas,monospace;font-size:18px;background:#d8f3ef;color:#0f766e;padding:14px 16px;border-radius:8px;letter-spacing:0.04em;">
           ${escapeHtml(secret)}
         </p>
         <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;">
           <a href="${appUrl}/login" style="color:#0f766e;">Entrar em SIGESC Hotelaria</a>
         </p>
         <p style="font-family:Arial,sans-serif;font-size:13px;color:#6f675e;">A palavra-passe temporária expira em breve e é de utilização única.</p>`,
        `Olá ${name},\n\nA conta SIGESC Hotelaria para ${institution} foi criada.\nPalavra-passe temporária: ${secret}\nEntrar: ${appUrl}/login\n\nDeve alterar a palavra-passe no primeiro acesso.`,
      );
    }
    case "PASSWORD_RECOVERY": {
      const token = input.secret ?? "";
      const basePath = (input.resetPath || "/reset-password").split("?")[0] || "/reset-password";
      const path = `${basePath}?token=${encodeURIComponent(token)}`;
      const link = `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
      return shell(
        "Recuperação de palavra-passe",
        `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3a34;">Olá ${escapeHtml(name)},</p>
         <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3a34;">
           Recebemos um pedido para redefinir a sua palavra-passe. Este link é de utilização única e expira em breve.
         </p>
         <p style="font-family:Arial,sans-serif;font-size:15px;">
           <a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;">Redefinir palavra-passe</a>
         </p>
         <p style="font-family:Arial,sans-serif;font-size:13px;color:#6f675e;">Se não solicitou este email, ignore-o com segurança.</p>`,
        `Olá ${name},\n\nRedefinir palavra-passe: ${link}\n\nSe não solicitou, ignore este email.`,
      );
    }
    case "PASSWORD_CHANGED": {
      return shell(
        "Palavra-passe actualizada",
        `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3a34;">Olá ${escapeHtml(name)},</p>
         <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3a34;">
           A sua palavra-passe SIGESC Hotelaria foi alterada com sucesso. Se não reconhece esta acção, contacte o suporte imediatamente.
         </p>`,
        `Olá ${name},\n\nA sua palavra-passe foi alterada com sucesso.`,
      );
    }
    case "USER_INVITATION": {
      return shell(
        "Convite para SIGESC Hotelaria",
        `<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3a34;">Olá ${escapeHtml(name)},</p>
         <p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3f3a34;">
           Foi convidado para ${escapeHtml(institution)} no SIGESC Hotelaria.
           <a href="${appUrl}/login" style="color:#0f766e;">Activar acesso</a>
         </p>`,
        `Olá ${name},\n\nFoi convidado para ${institution}. Activar: ${appUrl}/login`,
      );
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
