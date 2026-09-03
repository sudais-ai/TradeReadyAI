"use server";

import { cookies } from "next/headers";
import { Locale } from "@/lib/i18n";
import { revalidatePath } from "next/cache";

export async function setLocaleCookie(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, { path: "/" });
  revalidatePath("/", "layout");
}

export async function getLocaleCookie(): Promise<Locale> {
  const cookieStore = await cookies();
  const val = cookieStore.get("NEXT_LOCALE")?.value as Locale | undefined;
  if (val === "es" || val === "en") return val;
  return "en";
}
