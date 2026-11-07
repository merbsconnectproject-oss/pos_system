import type { HTMLAttributes } from 'react';

const Bone = ({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div {...props} className={`rounded-lg bg-slate-200/80 motion-safe:animate-pulse ${className}`} />
);

interface WorkspaceLoadingScreenProps {
  message?: string;
}

/** A data-neutral preview of the application shell shown during hydration. */
export function WorkspaceLoadingScreen({
  message = 'Loading your workspace…',
}: WorkspaceLoadingScreenProps) {
  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Bone className="h-9 w-9 rounded-xl bg-slate-300/80" />
          <div className="space-y-2">
            <Bone className="h-3 w-28" />
            <Bone className="h-2 w-20" />
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Bone className="hidden h-9 w-28 sm:block" />
          <Bone className="h-9 w-9 rounded-full" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 bg-slate-950 p-4 md:block" aria-hidden="true">
          <div className="space-y-3 pt-2">
            {[72, 88, 64, 80, 68, 84].map((width, index) => (
              <div key={`${width}-${index}`} className="flex h-10 items-center gap-3 px-2">
                <Bone className="h-5 w-5 shrink-0 bg-slate-700" />
                <Bone className="h-3 bg-slate-700" style={{ width: `${width}%` }} />
              </div>
            ))}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-hidden p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1600px] space-y-6">
            <div className="flex items-end justify-between gap-6">
              <div className="space-y-3">
                <Bone className="h-4 w-24" />
                <Bone className="h-8 w-56 max-w-[60vw]" />
              </div>
              <Bone className="hidden h-10 w-36 sm:block" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <Bone className="h-3 w-24" />
                  <Bone className="mt-5 h-7 w-32" />
                  <Bone className="mt-4 h-3 w-20" />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="h-80 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
                <Bone className="h-4 w-40" />
                <div className="mt-8 flex h-56 items-end gap-3" aria-hidden="true">
                  {[45, 68, 52, 80, 61, 74, 56, 86].map((height, index) => (
                    <Bone key={`${height}-${index}`} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
              <div className="h-80 rounded-2xl border border-slate-200 bg-white p-5">
                <Bone className="h-4 w-32" />
                <div className="mt-7 space-y-5">
                  {[1, 2, 3, 4].map((item) => (
                    <div key={item} className="flex items-center gap-3">
                      <Bone className="h-10 w-10 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Bone className="h-3 w-4/5" />
                        <Bone className="h-2 w-2/5" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <span className="sr-only">{message}</span>
    </div>
  );
}
