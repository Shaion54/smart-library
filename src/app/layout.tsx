import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Smart Library - Intelligent Workspace & Seat Management System",
  description:
    "Enterprise smart library platform for real-time desk occupancy monitoring, automated student reservations, and acoustic environment management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-[#F8FAFC] text-zinc-900 flex flex-col min-h-screen antialiased selection:bg-indigo-600 selection:text-white">
        <ToastProvider>
          <Navbar />
          <main className="flex-1 w-full">
            {children}
          </main>
          <footer className="border-t border-zinc-200 bg-white py-6 text-center text-xs text-zinc-500">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
              <p className="text-zinc-700 font-semibold">
                Smart Library Workspace &amp; Desk Management System
              </p>
              <p className="text-zinc-500">
                Automated Presence Detection &bull; Real-time Seat Allocation &bull; Acoustic Quiet Zone Management
              </p>
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
