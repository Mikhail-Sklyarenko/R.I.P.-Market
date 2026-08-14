import { useEffect } from 'react';
import {
  buildPageTitle,
  getDefaultDocumentTitle,
  setDocumentCanonical,
} from '../utils/document-head';

type PageMetaOptions = {
  title?: string | null;
  canonicalPath?: string | null;
  siteName?: string;
};

export function usePageMeta({
  title,
  canonicalPath,
  siteName = getDefaultDocumentTitle(),
}: PageMetaOptions) {
  const documentTitle =
    title == null ? null : buildPageTitle(title, siteName);

  useEffect(() => {
    const previousTitle = document.title;

    if (documentTitle) {
      document.title = documentTitle;
    }

    setDocumentCanonical(canonicalPath ?? null);

    return () => {
      document.title = previousTitle;
      setDocumentCanonical(null);
    };
  }, [documentTitle, canonicalPath]);
}
