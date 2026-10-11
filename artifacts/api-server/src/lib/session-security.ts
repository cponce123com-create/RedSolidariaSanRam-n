/** Establece una sesión administrativa nueva tras autenticar correctamente. */
export async function establishAdminSession(req: any, user: { id: number; username: string; name: string; role: string }): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((error: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });

  req.session.adminUser = user;

  await new Promise<void>((resolve, reject) => {
    req.session.save((error: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
