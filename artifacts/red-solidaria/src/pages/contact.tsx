import { useState } from "react";
import { useForm } from "react-hook-form";
import SEO from "@/components/shared/SEO";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useSendContactMessage } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { MapPin, Phone, Mail, Send } from "lucide-react";

export default function Contact() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const sendMessage = useSendContactMessage();

  const formSchema = z.object({
    name: z.string().min(2, t("contact.nameTooShort")),
    email: z.string().email(t("donation.invalidEmail")),
    phone: z.string().optional(),
    subject: z.string().min(4, t("contact.subjectTooShort")),
    message: z.string().min(10, t("contact.messageTooShort")),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", phone: "", subject: "", message: "" }
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    sendMessage.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: t("contact.toastSent"), description: t("contact.toastSentDesc") });
          form.reset();
        },
        onError: () => {
          toast({ title: t("donation.error"), description: t("contact.toastErrorDesc"), variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="min-h-screen pt-20 bg-background">
      <SEO
        title={t("nav.contact")}
        description={t("contact.seoDescription")}
        url="/contacto"
      />
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">{t("contact.title")}</h1>
            <p className="text-lg text-muted-foreground">
              {t("contact.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <Card className="p-8 text-center flex flex-col items-center border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2">{t("contact.location")}</h3>
              <p className="text-muted-foreground">San Ramón, Chanchamayo<br/>Junín, Perú</p>
            </Card>
            
            <Card className="p-8 text-center flex flex-col items-center border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                <Phone className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2">{t("contact.phone")}</h3>
              <p className="text-muted-foreground">+51 921 615 737</p>
            </Card>

            <Card className="p-8 text-center flex flex-col items-center border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2">{t("contact.email")}</h3>
              <p className="text-muted-foreground">contacto@redsolidariasanramon.org</p>
            </Card>
          </div>

          <div className="max-w-3xl mx-auto bg-card rounded-3xl p-8 md:p-10 shadow-xl border border-border">
            <h2 className="text-2xl font-bold mb-8">{t("contact.formTitle")}</h2>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("contact.fullName")}</FormLabel>
                        <FormControl>
                          <Input placeholder="Juan Pérez" className="bg-background rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("contact.emailLabel")}</FormLabel>
                        <FormControl>
                          <Input placeholder="juan@ejemplo.com" className="bg-background rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("donation.phoneOptional")}</FormLabel>
                        <FormControl>
                          <Input placeholder="987654321" className="bg-background rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("contact.subject")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("contact.subjectPlaceholder")} className="bg-background rounded-xl" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("contact.message")}</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder={t("contact.messagePlaceholder")} 
                          className="min-h-[150px] bg-background rounded-xl resize-none" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full md:w-auto px-8 rounded-xl h-12 text-base font-semibold shadow-lg shadow-primary/20 hover-elevate"
                  disabled={sendMessage.isPending}
                >
                  {sendMessage.isPending ? t("contact.sending") : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {t("contact.sendMessage")}
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </div>

        </div>
      </section>
    </div>
  );
}
