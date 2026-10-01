"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../../src/app");
const testServer_1 = require("../helpers/testServer");
const app = (0, app_1.createApp)();
describe('GET /api/services', () => {
    beforeEach(async () => {
        await (0, testServer_1.truncateAll)();
    });
    afterAll(async () => {
        await (0, testServer_1.closeDbPool)();
    });
    it('returns the seeded fictional services', async () => {
        const res = await (0, supertest_1.default)(app).get('/api/services');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(5);
        const slugs = res.body.map((s) => s.slug);
        expect(slugs).toContain('auth-api');
    });
    it('returns a single service by id', async () => {
        const list = await (0, supertest_1.default)(app).get('/api/services');
        const firstId = list.body[0].id;
        const res = await (0, supertest_1.default)(app).get(`/api/services/${firstId}`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(firstId);
    });
    it('returns 404 for a missing service', async () => {
        const res = await (0, supertest_1.default)(app).get('/api/services/999999');
        expect(res.status).toBe(404);
    });
    it('returns 400 for a non-numeric id', async () => {
        const res = await (0, supertest_1.default)(app).get('/api/services/not-a-number');
        expect(res.status).toBe(400);
    });
});
//# sourceMappingURL=services.test.js.map