import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

BigInt.prototype.toJSON = function () {
  return Number(this);
};

app.post('/wallets', async (req, res) => {
  try {
    const wallet = await prisma.wallet.create({ data: {} });
    res.status(201).json(wallet);
  } catch (error) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post('/wallets/:id/credit', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey || typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
    return res.status(400).json({ error: "Montant entier invalide ou clé d'idempotence manquante" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingTx = await tx.transaction.findUnique({
        where: { walletId_idempotencyKey: { walletId: id, idempotencyKey } }
      });

      if (existingTx) {
        if (Number(existingTx.amount) !== amount) {
          throw new Error("CONFLICT_409");
        }
        return existingTx; 
      }

      await tx.wallet.update({
        where: { id },
        data: { balance: { increment: amount } }
      });

      return await tx.transaction.create({
        data: { walletId: id, type: "CREDIT", amount, idempotencyKey }
      });
    });

    res.status(200).json(result);
  } catch (error) {
    if (error.message === "CONFLICT_409") return res.status(409).json({ error: "Clé d'idempotence déjà utilisée avec un montant différent" });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return res.status(404).json({ error: "Portefeuille introuvable" });
    res.status(500).json({ error: "Erreur lors du crédit" });
  }
});

app.post('/wallets/:id/debit', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey || typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
    return res.status(400).json({ error: "Montant entier invalide ou clé d'idempotence manquante" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existingTx = await tx.transaction.findUnique({
        where: { walletId_idempotencyKey: { walletId: id, idempotencyKey } }
      });

      if (existingTx) {
        if (Number(existingTx.amount) !== amount) throw new Error("CONFLICT_409");
        return existingTx;
      }

      const wallet = await tx.wallet.updateMany({
        where: { id, balance: { gte: amount } },
        data: { balance: { decrement: amount } }
      });

      if (wallet.count === 0) {
        throw new Error("INSUFFICIENT_FUNDS");
      }

      return await tx.transaction.create({
        data: { walletId: id, type: "DEBIT", amount, idempotencyKey }
      });
    });

    res.status(200).json(result);
  } catch (error) {
    if (error.message === "CONFLICT_409") return res.status(409).json({ error: "Conflit d'idempotence" });
    if (error.message === "INSUFFICIENT_FUNDS") return res.status(400).json({ error: "Fonds insuffisants ou portefeuille introuvable" });
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get('/wallets/:id', async (req, res) => {
  const wallet = await prisma.wallet.findUnique({ where: { id: req.params.id } });
  if (!wallet) return res.status(404).json({ error: "Non trouvé" });
  res.json(wallet);
});

app.get('/wallets/:id/transactions', async (req, res) => {
  const transactions = await prisma.transaction.findMany({ where: { walletId: req.params.id }, orderBy: { createdAt: 'desc' } });
  res.json(transactions);
});

export default app;