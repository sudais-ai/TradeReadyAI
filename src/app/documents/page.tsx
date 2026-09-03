import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/route";
import { isSessionStale } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/documents");
  }

  const claimMs = session.user.passwordChangedAt;
  const claimDate = typeof claimMs === "number" ? new Date(claimMs) : null;
  if (await isSessionStale(session.user.id, claimDate)) {
    redirect("/auth/signin?callbackUrl=/documents&reason=stale");
  }

  const documents = await prisma.document.findMany({
    where: {
      tradeCase: {
        userId: session.user.id,
        deletedAt: null,
      },
      deletedAt: null,
    },
    include: {
      tradeCase: {
        select: {
          id: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const hasDocuments = documents.length > 0;

  return (
    <div className="pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Documents" },
        ]}
      />

      <PageHeader
        title="Documents"
        description="View and manage all documents across your trade cases."
      />

      {!hasDocuments ? (
        <div className="mt-8">
          <EmptyState
            title="No documents yet"
            description="You haven't uploaded any documents to your trade cases yet."
            icon={
              <svg className="h-10 w-10 text-ink-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            }
            action={
              <Link href="/cases/new">
                <Button>
                  Create a Trade Case
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-8 bg-white border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-border text-ink-soft font-medium">
                <tr>
                  <th className="px-6 py-4 font-medium">Document Name</th>
                  <th className="px-6 py-4 font-medium">Trade Case</th>
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">Size</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-ink">{doc.name}</div>
                      <div className="text-xs text-ink-soft mt-0.5">
                        Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-ink">
                      <Link href={`/cases/${doc.tradeCase.id}`} className="hover:text-blue hover:underline">
                        {doc.tradeCase.product?.name || "Unnamed Product"}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-ink-soft">
                      {doc.type || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-ink-soft">
                      {doc.size ? formatBytes(doc.size) : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={doc.status === "Added" || doc.status === "Reviewed" ? "success" : "default"}>
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Link href={`/cases/${doc.tradeCase.id}/documents/${doc.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
