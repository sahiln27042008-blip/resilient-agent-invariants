// Anti-pattern: a refund POST that is repeated in full if the socket drops and the call is retried.
export async function refund(orderId: string, amount: number) {
  await fetch("https://payments.example.com/refunds", {
    method: "POST",
    body: JSON.stringify({ orderId, amount }),
  });
}
