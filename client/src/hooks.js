import { useEffect } from "react";

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · StyleARZ` : "StyleARZ — your personal fashion statement";
  }, [title]);
}
