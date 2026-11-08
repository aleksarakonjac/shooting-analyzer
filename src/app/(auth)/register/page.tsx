import { AuthForm } from '@/components/AuthForm';
import { register } from '@/lib/auth/actions';

export default function RegisterPage() {
  return <AuthForm mode="register" action={register} />;
}
