import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';

export default function CartPlaceholder() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased pb-20">
      <Header showBack title="My Cart" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 text-center">
        <span className="text-5xl">🛍️</span>
        <h1 className="mt-3 text-lg font-bold text-slate-800">Your Cart is Empty</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cart functionality will be wired up in feature F04.
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
