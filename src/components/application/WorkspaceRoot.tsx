'use client';

import dynamic from 'next/dynamic';

const Application = dynamic(() => import('./Application'), {ssr: false, loading: () => null});

export default function WorkspaceRoot() {
  return <Application />;
}
