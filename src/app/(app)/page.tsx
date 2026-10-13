import { Suspense } from "react";
import { Loading } from "@/components/loading";
import { JobListPage } from "@/components/job-list-page";

export default function TicketsPage(props: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading />}>
      <JobListPage searchParams={props.searchParams} />
    </Suspense>
  );
}
