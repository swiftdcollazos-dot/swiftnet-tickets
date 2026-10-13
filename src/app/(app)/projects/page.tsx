import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { JobListPage } from "@/components/job-list-page";

export default function ProjectsPage(props: PageProps<"/projects">) {
  return (
    <Suspense fallback={<Loading />}>
      <JobListPage searchParams={props.searchParams} projects />
    </Suspense>
  );
}
