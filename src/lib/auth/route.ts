import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

export { handlers, signIn, signOut, auth };