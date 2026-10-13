"use client";

import { useActionState } from "react";
import { Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { acceptInviteAction, type AcceptInviteState } from "./actions";

const initialState: AcceptInviteState = null;

export function AcceptInviteCard({
  membershipId,
  orgName,
}: {
  membershipId: string;
  orgName: string;
}) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initialState);

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-6 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
        <MailCheck size={20} />
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">Bạn được mời vào “{orgName}”</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        Bấm chấp nhận để tham gia tổ chức với vai trò thành viên.
      </p>
      <form action={formAction} className="mt-4">
        <input type="hidden" name="membership_id" value={membershipId} />
        {state?.error && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          Chấp nhận lời mời
        </Button>
      </form>
    </section>
  );
}
