// NextAuth module augmentation — adds the Phase 8 `passwordChangedAt` claim
// to the session user type. The value is stored as a Unix millisecond
// number (not a Date) because the JWT/session serializer turns Date
// objects into strings, which breaks .getTime() on the consumer side.

import "next-auth";

declare module "next-auth" {
  interface User {
    passwordChangedAt?: number | null;
  }
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      passwordChangedAt?: number | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    passwordChangedAt?: number | null;
  }
}
