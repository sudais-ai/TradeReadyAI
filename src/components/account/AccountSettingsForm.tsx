"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Button } from "@/components/ui/Button";

interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  /** Phase 12: ISO string of the most recent password rotation. Null for
   *  OAuth-only accounts (which never set a password). */
  passwordChangedAt: string | null;
}

interface AccountSettingsFormProps {
  user: User;
  hasPassword: boolean;
}

function Banner({
  type,
  text,
}: {
  type: "success" | "error";
  text: string;
}) {
  const styles =
    type === "success"
      ? "border-success-200 bg-success-50 text-success-700"
      : "border-error-200 bg-error-50 text-error-700";
  return (
    <p
      role={type === "error" ? "alert" : "status"}
      className={`rounded-md border px-3 py-2 text-xs ${styles}`}
    >
      {text}
    </p>
  );
}

export function AccountSettingsForm({ user, hasPassword }: AccountSettingsFormProps) {
  const router = useRouter();
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameMessage(null);
    setIsUpdatingName(true);
    try {
      const res = await fetch("/api/account/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNameMessage({ type: "error", text: data?.error ?? "Failed to update name." });
        return;
      }
      setNameMessage({ type: "success", text: "Name updated successfully." });
      router.refresh();
    } catch {
      setNameMessage({ type: "error", text: "An unexpected error occurred." });
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "New passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMessage({ type: "error", text: data?.error ?? "Failed to change password." });
        return;
      }
      setPasswordMessage({ type: "success", text: "Password changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      // Phase 12: refresh the server component so the new
      // "Password last changed" timestamp renders without a full
      // navigation.
      router.refresh();
    } catch {
      setPasswordMessage({ type: "error", text: "An unexpected error occurred." });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    const { csrfToken } = await csrfRes.json();
    const formData = new URLSearchParams();
    formData.set("csrfToken", csrfToken);
    formData.set("callbackUrl", "/auth/signin");
    formData.set("json", "true");
    await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    // Phase 17: soft navigation. The signout endpoint cleared the
    // session cookie on the response, so the RSC for /auth/signin
    // (a public page) doesn't need a full reload.
    router.push("/auth/signin");
  };

  return (
    <div className="space-y-6">
      {/* Profile section */}
      <Card className="border-border">
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-ink">Profile</h2>

          <div>
            <Label>Email</Label>
            <p className="mt-1 text-sm font-medium text-ink">{user.email}</p>
            {user.emailVerified ? (
              <span className="mt-1 inline-flex items-center rounded-full bg-mint/10 px-2 py-0.5 text-xs font-semibold text-mint">
                Verified
              </span>
            ) : (
              <span className="mt-1 inline-flex items-center rounded-full bg-amber/10 px-2 py-0.5 text-xs font-semibold text-amber">
                Not verified
              </span>
            )}
          </div>

          <form onSubmit={handleUpdateName} className="space-y-3">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
            {nameMessage && <Banner type={nameMessage.type} text={nameMessage.text} />}
            <Button
              type="submit"
              size="sm"
              isLoading={isUpdatingName}
              disabled={name.trim() === user.name}
            >
              Save name
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Password section */}
      {hasPassword && (
        <Card className="border-border">
          <CardContent className="p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-ink">Change Password</h2>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <p className="text-xs text-ink-soft">
                  8+ characters with uppercase, lowercase, a number, and a symbol.
                </p>
              </div>
              {passwordMessage && <Banner type={passwordMessage.type} text={passwordMessage.text} />}
              <Button
                type="submit"
                size="sm"
                isLoading={isChangingPassword}
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Change password
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Account info */}
      <Card className="border-border">
        <CardContent className="p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-ink">Account Info</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted font-medium">Member since</dt>
              <dd className="font-medium text-ink">{new Date(user.createdAt).toLocaleDateString()}</dd>
            </div>
            {user.lastLoginAt && (
              <div className="flex justify-between">
                <dt className="text-muted font-medium">Last sign-in</dt>
                <dd className="font-medium text-ink">{new Date(user.lastLoginAt).toLocaleString()}</dd>
              </div>
            )}
            {/* Phase 12: surface password rotation timestamp so the
                user can verify a recent change actually persisted. */}
            {hasPassword && user.passwordChangedAt && (
              <div className="flex justify-between">
                <dt className="text-muted font-medium">Password last changed</dt>
                <dd className="font-medium text-ink">
                  {new Date(user.passwordChangedAt).toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Card className="border-border">
        <CardContent className="p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-ink">Sign Out</h2>
          <p className="text-sm text-ink-soft">
            Sign out of your TradeReady AI account on this device.
          </p>
          <div>
            <Button variant="outline" onClick={handleSignOut} className="text-error-600 border-error-200 hover:bg-error-50">
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
