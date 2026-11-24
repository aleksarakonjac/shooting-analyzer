'use client';
import { useRouter } from 'next/navigation';
import { confirmOwnUpload, startOwnUpload } from '@/lib/inbox/actions';
import { DropBox, type DropShooter } from './DropBox';

/** The drop area of the inbox: a shooter for themselves, a coach for a linked shooter. */
export function OwnDrop({ shooters, fixed, tz }: { shooters: DropShooter[]; fixed: boolean; tz: string }) {
  const router = useRouter();
  return <DropBox shooters={shooters} fixed={fixed} tz={tz} sender={{ start: startOwnUpload, confirm: confirmOwnUpload }} onSent={() => router.refresh()} />;
}
