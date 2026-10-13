import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-4">
      <h1 className="mb-2 flex justify-center">
        <Image src="/logo.png" alt="Swiftnet I.T." width={1163} height={198} priority className="h-auto w-64" />
      </h1>
      <p className="mb-6 text-center text-slate-500">Work Tracker</p>
      <LoginForm />
    </main>
  );
}
