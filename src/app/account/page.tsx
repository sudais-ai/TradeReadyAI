import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/route";
import { prisma } from "@/lib/db/prisma";
import { isSessionStale } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccountSettingsForm } from "@/components/account/AccountSettingsForm";

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/account");
  }

  // Phase 8: a JWT issued before a password change is stale. Bounce the
  // user back to sign-in with a reason marker.
  const claimMs = session.user.passwordChangedAt;
  const claimDate = typeof claimMs === "number" ? new Date(claimMs) : null;
  if (await isSessionStale(session.user.id, claimDate)) {
    redirect("/auth/signin?callbackUrl=/account&reason=stale");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      createdAt: true,
      lastLoginAt: true,
      // Phase 12: surface to the UI so the user can see when their
      // password was last rotated.
      passwordChangedAt: true,
      passwordHash: true,
    },
  });

  if (!user) {
    redirect("/auth/signin");
  }

  return (
    <div className="pb-20">
      <PageHeader
        title="Account Settings"
        description="Manage your TradeReady AI account."
      />

      <AccountSettingsForm
        user={{
          id: user.id,
          email: user.email,
          name: user.name ?? "",
          emailVerified: !!user.emailVerified,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          // Phase 12: include in the prop bag. Null when the user has
          // never set a password (e.g. OAuth-only account).
          passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
        }}
        hasPassword={!!user.passwordHash}
      />
    </div>
  );
}
