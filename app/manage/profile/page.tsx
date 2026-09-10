"use client";

import { UserProfile, useUser } from "@clerk/nextjs";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import { useAdminPermissions } from "@/lib/hooks/useAdminPermissions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserProfileFallback } from "@/components/profile/UserProfileFallback";

export default function AdminProfilePage() {
  const { data: userInfo, isLoading } = useUserInfo();
  const { role } = useAdminPermissions();
  // Clerk renders nothing until its script boots; hold the shape until then.
  const { isLoaded: isClerkLoaded } = useUser();

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">
          Manage your account information and preferences
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 p-6">
          {isLoading ? (
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
          ) : userInfo && !(userInfo instanceof Error) ? (
            <>
              <Avatar className="h-16 w-16">
                <AvatarImage
                  src={userInfo.avatar_url}
                  alt={userInfo.first_name}
                />
                <AvatarFallback className="text-lg">
                  {userInfo.first_name?.charAt(0)}
                  {userInfo.last_name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">
                  {userInfo.first_name} {userInfo.last_name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {userInfo.email}
                </p>
                {role && (
                  <Badge variant="secondary">{role.role_name}</Badge>
                )}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {!isClerkLoaded ? (
        <Card>
          <CardContent className="p-6">
            <UserProfileFallback />
          </CardContent>
        </Card>
      ) : null}
      <div className={isClerkLoaded ? undefined : "hidden"}>
        <UserProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: "w-full",
              cardBox: "w-full shadow-none",
              card: "w-full shadow-none border rounded-lg",
            },
          }}
        />
      </div>
    </div>
  );
}
