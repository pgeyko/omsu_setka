import React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { ScheduleContent } from '../components/ScheduleContent';

export const ScheduleView: React.FC = () => {
  const { type, id } = useParams();
  const location = useLocation();

  const entityID = parseInt(id || '0');
  const entityType = type || 'group';
  const initialName = location.state?.name || '';

  return (
    <ScheduleContent 
      entityType={entityType} 
      entityID={entityID} 
      initialName={initialName}
      showBackButton={true}
    />
  );
};
