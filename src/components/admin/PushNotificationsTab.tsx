import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Send } from "lucide-react";
import { toast } from "sonner";

const PushNotificationsTab = () => {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleBroadcast = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }

    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: { type: "broadcast", title, body },
    });
    setSending(false);

    if (error) {
      toast.error("Failed to send broadcast");
      return;
    }

    toast.success(`Broadcast sent to ${data?.sent || 0} of ${data?.total || 0} devices`);
    setTitle("");
    setBody("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" /> Push Broadcast
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Send a push notification to all users with the mobile app installed.
        </p>
        <div>
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New Feature Alert 🎉"
            className="mt-1"
          />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. Check out our new price tracking feature!"
            className="mt-1"
            rows={3}
          />
        </div>
        <Button onClick={handleBroadcast} disabled={sending} className="gradient-primary">
          <Send className="w-4 h-4 mr-2" />
          {sending ? "Sending..." : "Send Broadcast"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default PushNotificationsTab;
