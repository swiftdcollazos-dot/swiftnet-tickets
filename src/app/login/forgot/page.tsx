import Image from "next/image";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-4">
      <h1 className="mb-2 flex justify-center">
        <Image src="/logo.png" alt="Swiftnet I.T." width={1163} height={198} priority className="h-auto w-64" />
      </h1>
      <p className="mb-6 text-center text-slate-500">Reset your password</p>
      <ForgotForm />
    </main>
  );
}
