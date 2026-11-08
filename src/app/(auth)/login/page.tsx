import { AuthForm } from '@/components/AuthForm';
import { login } from '@/lib/auth/actions';

export default function LoginPage() {
  return <AuthForm mode="login" action={login} />;
}
