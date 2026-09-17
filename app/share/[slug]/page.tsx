"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ShareProjectPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  useEffect(() => {
    if (slug) {
      router.replace(`/view/${slug}`);
    } else {
      router.replace("/gallery");
    }
  }, [slug, router]);

  return null;
}
