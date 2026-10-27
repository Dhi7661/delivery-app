import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased">
      {/* Mobile-first Header designed for 360px+ viewport */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 px-3 py-2.5 shadow-xs backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <div className="flex flex-col shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-xs">
                {BRAND_NAME.charAt(0)}
              </span>
              <span className="text-xl font-black tracking-tight text-emerald-950">
                {BRAND_NAME}
              </span>
            </div>
            <span className="text-[10px] font-medium text-slate-500">
              15-45 mins delivery
            </span>
          </div>

          {/* Serviceable Pincode Selector */}
          <div className="flex min-h-[38px] shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
            <svg
              className="h-3.5 w-3.5 text-emerald-600 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-[11px]">Pin: <strong>411001</strong></span>
          </div>
        </div>

        {/* Search Bar - min 44px tap target */}
        <div className="mx-auto mt-2 max-w-md">
          <div className="relative flex items-center">
            <svg
              className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              placeholder="Search groceries, milk, snacks..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white shadow-sm">
          <span className="inline-block rounded-md bg-emerald-500/30 px-2 py-0.5 text-xs font-semibold text-emerald-100">
            Local Partners
          </span>
          <h1 className="mt-2 text-lg font-bold leading-tight">
            {BRAND_TAGLINE}
          </h1>
          <p className="mt-1 text-xs text-emerald-100">
            Real prices directly from local neighbourhood shops. Customer price is never above printed MRP.
          </p>
        </div>

        {/* Category Pills */}
        <div className="mt-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
            Browse Categories
          </h2>
          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {[
              { name: "Grocery", icon: "🌾" },
              { name: "Dairy", icon: "🥛" },
              { name: "Snacks", icon: "🍪" },
              { name: "Bakery", icon: "🍞" },
            ].map((cat) => (
              <button
                key={cat.name}
                type="button"
                className="flex min-h-[56px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-center shadow-2xs hover:border-emerald-300"
              >
                <span className="text-xl">{cat.icon}</span>
                <span className="mt-1 text-xs font-semibold text-slate-700">
                  {cat.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
