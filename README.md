# QRxfr
cli tool to share files between devices in the same network by scanning a QR
> ur mobile must be on same network as the pc or must be able to access the pc's local ip

> zips directories b4 sending

> no internet connection needed
### setup
```
git clone
cd QRxfr
npm ci
npm start
```
### install:
`npm install -g qrxfr` || `npx qrxfr` ...
### usage
```
qrxfr [options {values}] <path>
qrxfr [--message MESSAGE]
qrxfr --help
```
---
#### troubleshooting
- try to ping the pc from the mobile and vice versa to ensure basic connectivity.
- ensure that the firewall on the PC is not blocking incoming connections. You may need to create a rule to allow traffic on the port your server is listening to or try running on a different port
