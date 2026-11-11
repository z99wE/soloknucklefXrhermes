# Disclaimer

## No warranty

THIS SOFTWARE IS PROVIDED "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT ARE DISCLAIMED. IN NO EVENT SHALL
THE AUTHORS, COPYRIGHT HOLDERS, OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING,
BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
OF THE POSSIBILITY OF SUCH DAMAGE.

## Use at your own risk

By using Soloknuckle you acknowledge that:

1. **It is a pattern matcher, not a security audit.** It may produce false
   positives (flagging safe code) and false negatives (missing a real problem).
   It does not replace human review, a secrets manager, or a professional
   security assessment. `SECURITY.md` documents the known limits in detail.

2. **It does not process your data remotely.** There is no server, no account,
   and no network call. Nothing you scan is transmitted anywhere by this tool.

3. **It can change two files.** `soloknuckle init` writes `AGENTS.md` and
   installs git hooks, preserving any hook that was already there as
   `<hook>.local`. It never edits application source. Keep your work in version
   control anyway.

4. **It runs your project's own scripts.** The health check executes `npm run
   lint` and `npm test` in the current directory, with your user's permissions.
   Only run it in a project you trust, exactly as you would run `npm test`.

5. **The command firewall is advisory.** It recognises dangerous command shapes,
   not intent. It cannot stop a determined operator, and `git commit
   --no-verify` skips the git hooks entirely.

6. **It makes no compliance claim.** Soloknuckle does not ensure compliance with
   GDPR, HIPAA, SOC 2, PCI DSS, or any other framework.

7. **No guarantee of availability or compatibility.** It may fail to run on your
   platform, Node version, or shell. Report it; do not depend on it as a control
   in a production pipeline without verifying the exit codes yourself.

## Limitation of liability

IN NO EVENT SHALL THE MAINTAINERS, CONTRIBUTORS, OR AFFILIATES BE LIABLE FOR ANY
INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF
OR RELATED TO YOUR USE OF THIS SOFTWARE, INCLUDING BUT NOT LIMITED TO LOSS OF
PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGES.

## Changes

The maintainers may update this disclaimer at any time. Your continued use of the
software after a change constitutes acceptance of the updated text.

---

**If you do not agree with these terms, do not use this software.**
