import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Empty } from '../components/ui';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="page">
      <Empty icon={Compass} title="This page doesn't exist" text="The link may be from an older build of the demo. Head back to the fleet overview."
        action={<button type="button" className="app-primary-btn btn-md" onClick={() => navigate('/')}>Open fleet overview</button>} />
    </div>
  );
}
