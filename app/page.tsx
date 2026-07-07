import { loadTemplates } from '@/lib/templates/loader';
import TemplateGallery from '@/components/TemplateGallery';

export const dynamic = 'force-dynamic'; // pick up newly dropped template files without a rebuild in dev

export default function HomePage() {
  const templates = loadTemplates();
  return <TemplateGallery templates={templates} />;
}
