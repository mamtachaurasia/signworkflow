import useContextStore from "@/hooks/useContextStore";
import useDropZone from "@/hooks/useDropZone";
import useCreateScratchDocument from '@/hooks/useCreateScratchDocument';
import { useTemplates } from "@/hooks/useTemplates";
import { SecondarySidebarType } from "@/types/types";
import { ChevronDown, FileStack, Layers, Plus, Trash2 } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import UploadProgressOverlay from "@/components/UploadProgressOverlay";
import { CloudFromUpload, DropboxLogo, GoogleDriveLogo, ChooseFromTemplate, AddNewDoc } from "../CustomIconSet";
import { Button } from "@ui";
import { useCloudDocumentPicker} from '@/hooks/useCloudDocumentPicker';

const SIDEBAR_TEMPLATE_CACHE_TTL_MS = 60_000;
const sidebarTemplateRefreshTimes = new Map<string, number>();
const sidebarTemplateRefreshes = new Map<string, Promise<void>>();

const DocumentsMenu = ({
  activeSecondarybar,
  secondaryActive,
}: {
  activeSecondarybar: SecondarySidebarType;
  secondaryActive: (s: SecondarySidebarType) => void;
}) => {
  const { documents, trashedTemplatesCount, user } = useContextStore();
  const { templates, fetchTemplates, fetchTrashedTemplatesCount } = useTemplates();
  const [templatesManuallyOpen, setTemplatesManuallyOpen] = useState(false);
  const router = useRouter();
  const templateScopeKey = `${user?.id ?? 'guest'}:${user?.orgId ?? 'personal'}`;

  useEffect(() => {
    const refreshedAt = sidebarTemplateRefreshTimes.get(templateScopeKey) ?? 0;
    if (Date.now() - refreshedAt < SIDEBAR_TEMPLATE_CACHE_TTL_MS) {
      return;
    }

    let refresh = sidebarTemplateRefreshes.get(templateScopeKey);
    if (!refresh) {
      refresh = Promise.all([fetchTemplates(), fetchTrashedTemplatesCount()])
        .then(() => {
          sidebarTemplateRefreshTimes.set(templateScopeKey, Date.now());
        })
        .finally(() => {
          sidebarTemplateRefreshes.delete(templateScopeKey);
        });
      sidebarTemplateRefreshes.set(templateScopeKey, refresh);
    }

    void refresh;
  }, [fetchTemplates, fetchTrashedTemplatesCount, templateScopeKey]);

  const searchParams = useSearchParams();
  const view = searchParams?.get('view');
  const isTemplateView = view === 'my' || view === 'system' || view === 'all';

  const systemTemplatesCount = useMemo(
    () => templates.filter((t) => t.isSystemTemplate).length,
    [templates]
  );
  const myTemplatesCount = useMemo(() => {
    const myTemplates = templates.filter((t) => !t.isSystemTemplate).length;
    return Math.max(0, myTemplates - trashedTemplatesCount);
  }, [templates, trashedTemplatesCount]);
  const templatesOpen = isTemplateView || templatesManuallyOpen;

  useEffect(() => {
    if (isTemplateView) {
      secondaryActive('my-templates');
    }
  }, [isTemplateView, secondaryActive]);

  return (
    <>
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Documents</h2>
      {/* Dropdown */}
      <NewDocMenu secondaryActive={secondaryActive} />
      <div className="mt-6 flex items-center gap-2 text-slate-500 text-xs font-medium uppercase">
        Quick Access
      </div>
      <nav className="mt-3 space-y-2 text-sm">
        <button onClick={() => {
          secondaryActive('dash-documents');
          router.push('/dashboard');
        }}
          className={`w-full flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-slate-100 border-l-4 ${activeSecondarybar === 'dash-documents'
              ? 'bg-slate-100 text-slate-800 border-brand-600'
              : 'hover:bg-slate-50 border-transparent'
            }`}
        >
          <div className="flex items-center gap-3">
            <FileStack className="w-5 h-5 text-slate-600" />
            <span className="font-medium text-slate-800">Documents</span>
          </div>
          <div className="text-slate-500">{documents.filter(doc => !doc.deletedAt).length}</div>
        </button>

        <div>
          <button
            onClick={() => setTemplatesManuallyOpen((previous) => !previous)}
            className={`w-full flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-slate-100 border-l-4 ${activeSecondarybar === 'my-templates'
                ? 'bg-slate-100 text-slate-800 border-brand-600'
                : 'hover:bg-slate-50 border-transparent'
              }`}
          >
            <div className="flex items-center gap-3 text-slate-700">
              <Layers className="w-5 h-5 text-slate-600" />
              <span>Templates</span>
            </div>
            <div className="text-slate-500">{myTemplatesCount + systemTemplatesCount}</div>
          </button>
          {templatesOpen && (
            <div className='pl-10 py-2 w-full space-y-1'>
              <button
                onClick={() => {
                  secondaryActive('my-templates');
                  router.push('/dashboard?view=my');
                }}
                className={`w-full flex justify-between items-center px-2 py-1 rounded-md text-xs ${view === 'my' ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span>▸ My Templates</span> {myTemplatesCount}
              </button>
              <button
                onClick={() => {
                  secondaryActive('my-templates');
                  router.push('/dashboard?view=system');
                }}
                className={`w-full flex justify-between items-center px-2 py-1 rounded-md text-xs ${view === 'system' ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                <span>▸ System Templates</span> {systemTemplatesCount}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => secondaryActive('trash')}
          className={`w-full flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-slate-100 border-l-4 ${activeSecondarybar === 'trash'
              ? 'bg-slate-100 text-slate-800 border-brand-600'
              : 'hover:bg-slate-50 border-transparent'
            }`}
        >
          <div className="flex items-center gap-3 text-slate-700">
            <Trash2 className="w-5 h-5 text-slate-600" />
            <span>Trash </span>
          </div>
          <div className="text-slate-500">{documents.filter(doc => doc.deletedAt).length + trashedTemplatesCount}</div>
        </button>
      </nav>
    </>
  );
};
export default DocumentsMenu;


export const NewDocMenu = ({
  secondaryActive
}: {
  secondaryActive: (s: SecondarySidebarType) => void;
}) => {
  const { isLoading, uploadStatus, handleFileInput, handleCloudFile } = useDropZone();
  const { createScratchDocument, isCreating } = useCreateScratchDocument();
  const [open, setOpen] = useState(false);
   const {
     isPickingCloud,
     openDropbox,
     openGoogleDrive,
   } = useCloudDocumentPicker({ onFileSelected: handleCloudFile });
  return (
    <div className="relative">
      {isLoading && <UploadProgressOverlay status={uploadStatus} />}
      <div className="flex">
        <button
          type="button"
          className="w-full primary-button rounded-tr-none rounded-br-none disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() => void createScratchDocument()}
          disabled={isCreating}
        >
          <span className='flex gap-1 justify-center'>
            <Plus />
            {isCreating ? 'Creating…' : 'New Document'}
          </span>
        </button>
        <div className=" group">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="primary-button rounded-tl-none rounded-bl-none px-2.5  border border-r border-brand-800 h-full"
            aria-label="More new document options"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <div className={`${open ? 'block' : 'hidden'} absolute right-0 mt-1 w-[250] bg-white border border-gray-200 rounded-md shadow-lg z-30 divide-y`} role="menu">
            <label className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 h-14">
              <input type="file" className="hidden" onChange={handleFileInput} accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
              <div className="flex gap-2 w-62.5">
                <div className='w-10 flex items-center'>
                  <AddNewDoc/>
                </div>
                <div className='text-left'>
                  <div className="font-bold text-gray-800">Document</div>
                  <div className="text-gray-500 text-xs">Upload PDF, DOC, or DOCX</div>
                </div>
              </div>
            </label>
            <button className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 h-14" onClick={() => secondaryActive('my-templates')}>
              <div className="flex gap-2 w-62.5">
                <div className='w-10 flex items-center'>
                 <ChooseFromTemplate/>
                </div>
                <div className='text-left'>
                  <div className="font-bold text-gray-800">Template</div>
                  <div className="text-gray-500 text-xs">Ready-made pre-built file</div>
                </div>
              </div>
            </button>
             <div className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              <div className="flex gap-2 w-62.5">
                <div className='w-10 flex items-center'>
                  <CloudFromUpload className="mt-5"/>
                </div>
                <div className='text-left'>
                  <div className="font-bold text-gray-800">Choose from cloud</div>
                  <div className="flex items-center justify-center gap-8 py-2">
                    <Button
                      type="button"
                      className="inline-flex h-12 w-12"
                      onClick={() => void openDropbox()}
                      disabled={isPickingCloud}
                      aria-label="Choose from Dropbox"
                      title="Dropbox"
                      icon={<DropboxLogo className="p-3 scale-0.5" />}
                      variant="outlineBrand"
                    />
                    <Button
                      type="button"
                      className="inline-flex h-12 w-12"
                      onClick={() => void openGoogleDrive()}
                      disabled={isPickingCloud}
                      aria-label="Choose from Google Drive"
                      title="Google Drive"
                      variant="outlineBrand"
                      icon={<GoogleDriveLogo className="p-3" />}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
       </div>
      </div>
    </div>
  )

}
