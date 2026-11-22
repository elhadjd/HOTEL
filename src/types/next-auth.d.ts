import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      mustChangePassword?: boolean;
      institutionId?: string;
    };
  }

  interface User {
    mustChangePassword?: boolean;
    sessionVersion?: number;
    institutionId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    mustChangePassword?: boolean;
    sessionVersion?: number;
    institutionId?: string;
  }
}
