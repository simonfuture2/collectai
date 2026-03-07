import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

const DeleteAccount = () => {
  const [user, setUser] = useState<any>(null);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const handleDelete = async () => {
    if (confirmText !== "DELETE") return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await supabase.auth.signOut();
      setSubmitted(true);
      toast.success("Your account and all data have been permanently deleted.");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong. Please email support@collectai.app for assistance.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-border/50">
          <CardContent className="pt-8 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-display font-bold">Account Deleted</h2>
            <p className="text-sm text-muted-foreground">
              Your account and all associated data have been permanently removed.
              If you have questions, email <a href="mailto:support@collectai.app" className="text-primary hover:underline">support@collectai.app</a>.
            </p>
            <Link to="/">
              <Button className="mt-4">Return Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-border/50">
          <CardContent className="pt-8 text-center space-y-4">
            <p className="text-muted-foreground">You must be signed in to delete your account.</p>
            <Link to="/auth">
              <Button>Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-destructive/30">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-xl font-display">Delete Your Account</CardTitle>
          <CardDescription>
            This action is permanent and cannot be undone
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
            <p className="font-semibold text-foreground">This will permanently delete:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Your entire card collection and scan history</li>
              <li>All folders and organization data</li>
              <li>Your profile and account information</li>
              <li>Credit balance and transaction history</li>
            </ul>
            <p className="mt-3 text-xs">
              Note: AuthentiSeal certificates on the blockchain are immutable and cannot be deleted.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Type <strong>DELETE</strong> to confirm</Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>

          <Button
            variant="destructive"
            className="w-full"
            disabled={confirmText !== "DELETE" || submitting}
            onClick={handleDelete}
          >
            {submitting ? "Deleting..." : "Permanently Delete My Account"}
          </Button>

          <Link to="/dashboard">
            <Button variant="ghost" className="w-full">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeleteAccount;
