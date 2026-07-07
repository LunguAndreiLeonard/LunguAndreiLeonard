import { loadTemplates } from '@/lib/templates/loader';
import GenerateForm from '@/components/GenerateForm';

export const dynamic = 'force-dynamic';

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; rerun?: string; continue?: string }>;
}) {
  const params = await searchParams;
  const templates = loadTemplates();
  return (
    <GenerateForm
      templates={templates}
      initialTemplateId={params.template}
      rerunJobId={params.rerun}
      continueJobId={params.continue}
    />
  );
}
