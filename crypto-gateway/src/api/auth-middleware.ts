import type { Request, Response, NextFunction } from 'express';

export function bearerAuth(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const token = header.slice('Bearer '.length).trim();
    if (token !== apiKey) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    next();
  };
}
