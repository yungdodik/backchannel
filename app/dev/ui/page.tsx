import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DevUiPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <Input placeholder="Input" />
      <div className="flex items-center gap-2">
        <Button>Button</Button>
        <Badge>Badge</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Card title</CardTitle>
        </CardHeader>
        <CardContent>Card content</CardContent>
      </Card>
      <Collapsible>
        <CollapsibleTrigger>Collapsible trigger</CollapsibleTrigger>
        <CollapsibleContent>Collapsible content</CollapsibleContent>
      </Collapsible>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Round</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Acme</TableCell>
            <TableCell>Seed</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Globex</TableCell>
            <TableCell>Series A</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Skeleton className="h-6 w-full" />
    </main>
  );
}
