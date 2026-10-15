module.exports = { createTransport: () => ({ sendMail: async m => { if (global.__mailFail) throw new Error('smtp giù'); (global.__mails = global.__mails || []).push(m); } }) };
