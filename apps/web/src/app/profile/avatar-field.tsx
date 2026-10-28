"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ImageField } from "@/components/image-field";
import { useTRPC } from "@/trpc/client";

export function AvatarField({ name, image }: { name: string; image: string | null }) {
  const router = useRouter();
  const trpc = useTRPC();
  const setAvatar = useMutation(trpc.user.setAvatar.mutationOptions({ onSuccess: () => router.refresh() }));

  return (
    <ImageField
      purpose="avatar"
      label="Profile photo"
      hint="Cropped to a square."
      currentUrl={image}
      placeholder={
        <span className="flex size-full items-center justify-center text-lg font-semibold text-muted">
          {(name || "?").split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
        </span>
      }
      onSave={(key) => setAvatar.mutateAsync({ key })}
    />
  );
}
