import { useState } from "react";
import { useForm } from "react-hook-form";
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

const formSchema = z.object({
  name: z.string().min(2, "Nombre muy corto"),
  email: z.string().email("Correo inválido"),
  phone: z.string().optional(),
  subject: z.string().min(4, "Asunto muy corto"),
  message: z.string().min(10, "Mensaje muy corto"),
});

export default function Contact() {
  const { toast } = useToast();
  const sendMessage = useSendContactMessage();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", phone: "", subject: "", message: "" }
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    sendMessage.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Mensaje enviado", description: "Nos pondremos en contacto pronto." });
          form.reset();
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo enviar el mensaje.", variant: "destructive" });
        }
      }
    );
  };

  return (
    <div className="min-h-screen pt-20 bg-background">
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-6">Contáctanos</h1>
            <p className="text-lg text-muted-foreground">
              ¿Tienes dudas sobre donaciones, quieres unirte como voluntario o reportar un caso social? Escríbenos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <Card className="p-8 text-center flex flex-col items-center border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2">Ubicación</h3>
              <p className="text-muted-foreground">San Ramón, Chanchamayo<br/>Junín, Perú</p>
            </Card>
            
            <Card className="p-8 text-center flex flex-col items-center border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                <Phone className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2">Teléfono</h3>
              <p className="text-muted-foreground">+51 987 654 321</p>
            </Card>

            <Card className="p-8 text-center flex flex-col items-center border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2">Email</h3>
              <p className="text-muted-foreground">hola@redsolidariasanramon.org</p>
            </Card>
          </div>

          <div className="max-w-3xl mx-auto bg-card rounded-3xl p-8 md:p-10 shadow-xl border border-border">
            <h2 className="text-2xl font-bold mb-8">Envíanos un mensaje</h2>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre completo</FormLabel>
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
                        <FormLabel>Correo electrónico</FormLabel>
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
                        <FormLabel>Teléfono (Opcional)</FormLabel>
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
                        <FormLabel>Asunto</FormLabel>
                        <FormControl>
                          <Input placeholder="Quiero ser voluntario" className="bg-background rounded-xl" {...field} />
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
                      <FormLabel>Mensaje</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Escribe tu mensaje aquí..." 
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
                  {sendMessage.isPending ? "Enviando..." : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Mensaje
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
