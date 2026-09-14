declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        nombre: string;
        email: string;
        role: string;
      };
    }
  }
}

export {};
