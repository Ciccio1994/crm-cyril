'use client'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          CRM Cyril
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          Connecte-toi avec ton compte Google pour accéder à ton CRM.
        </p>
        <button
          onClick={handleLogin}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Se connecter avec Google
        </button>
      </div>
    </main>
  )
}