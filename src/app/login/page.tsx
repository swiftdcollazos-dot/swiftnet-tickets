import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-4">
      <h1 className="h1 mb-1 text-brand">Swiftnet</h1>
      <p className="mb-6 text-slate-500">Service tickets</p>
      <LoginForm />
    </main>
  );
}
