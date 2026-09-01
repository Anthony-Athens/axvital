import Link from "next/link";
export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
      <nav aria-label="Footer" className="mb-3 flex flex-wrap justify-center gap-x-5 gap-y-2"><Link href="/pricing">Pricing</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/contact">Contact</Link><Link href="/login">Sign In</Link><Link href="/signup">Get Started</Link></nav>
      <p>AXVital helps organize information you choose to track. It does not provide medical diagnosis or treatment.</p>
    </footer>
  );
}
