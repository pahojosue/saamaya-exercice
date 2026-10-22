import request from 'supertest'; // Correction : Import par défaut, pas de destructuration
import app from "../app.js";
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Wallet API', () => {
  let walletId;

  beforeAll(async () => {
    // Nettoyage de la base de test
    await prisma.transaction.deleteMany();
    await prisma.wallet.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('devrait créer un portefeuille', async () => {
    const res = await request(app).post('/wallets');
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.balance).toEqual(0);
    walletId = res.body.id;
  });

  it('devrait créditer le portefeuille', async () => {
    const res = await request(app)
      .post(`/wallets/${walletId}/credit`)
      .set('Idempotency-Key', 'key-credit-1')
      .send({ amount: 15000 });
    expect(res.statusCode).toEqual(200);
    expect(res.body.amount).toEqual(15000);
  });

  it('devrait respecter l\'idempotence sur un crédit en double', async () => {
    const res = await request(app)
      .post(`/wallets/${walletId}/credit`)
      .set('Idempotency-Key', 'key-credit-1')
      .send({ amount: 15000 });
    expect(res.statusCode).toEqual(200);
  });

  it('devrait renvoyer 409 sur clé identique mais montant différent', async () => {
    const res = await request(app)
      .post(`/wallets/${walletId}/credit`)
      .set('Idempotency-Key', 'key-credit-1')
      .send({ amount: 20000 });
    expect(res.statusCode).toEqual(409);
  });

  it('devrait refuser un débit si solde insuffisant', async () => {
    const res = await request(app)
      .post(`/wallets/${walletId}/debit`)
      .set('Idempotency-Key', 'key-debit-1')
      .send({ amount: 50000 });
    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/Fonds insuffisants/);
  });
});