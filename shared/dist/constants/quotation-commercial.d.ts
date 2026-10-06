export declare const QUOTATION_PAYMENT_METHODS: readonly ["transferencia", "efectivo", "efectivo_transferencia", "a_convenir"];
export type QuotationPaymentMethod = (typeof QUOTATION_PAYMENT_METHODS)[number];
export declare const QUOTATION_PAYMENT_LABELS: Record<QuotationPaymentMethod, string>;
export declare const QUOTATION_BANK_ACCOUNTS: readonly [{
    readonly banco: "BCI";
    readonly cuenta: "89938 640";
    readonly tipo: "Cuenta corriente";
}, {
    readonly banco: "BANCO DE CHILE";
    readonly cuenta: "1073164200";
    readonly tipo: "Cuenta corriente";
}];
export declare const QUOTATION_BANK_RECIPIENT: {
    readonly rut: "77.374.788-1";
    readonly empresa: "UNITHOR SERVICIOS INTEGRALES SpA";
    readonly contacto: "CONTACTO@UNITHOR.CL";
};
