---
title: "Why I Built My Own File-Sharing Service"
date: 2026-11-16
draft: true
description: "A personal file-sharing tool, several repositories, an unsuccessful advertising experiment, and a rewrite that made it useful every day."
tags: ["file-sharing", "privacy", "personal-projects", "ai"]
---

A file-sharing website can promise to delete an upload after a day. I still cannot see what happens to the file after I send it. Does it disappear from storage, or only from the page? Could a copy remain somewhere indefinitely?

That bothered me more than the inconvenience of finding a service. Searching for one often meant dealing with file-size limits and advertisements, then deciding whether I trusted the website itself. I did not want to worry about a suspicious download. I also did not want to hand over something private and hope the operator would forget it later.

Sometimes the material I want to move is a password, credit card information, or a copy of an ID or passport. Those are very different things to leave on an unfamiliar website than a picture I have already posted publicly.

I wanted a service I could use for my own transfers, with control over how long an upload stayed available. Eventually, I also wanted the server to have no ordinary way to read what I uploaded. Getting there involved several repositories, some mistakes, and a much later rewrite.

<!--more-->

## First, I had to figure out how to make a website

When I started in 2023, I was new to coding, Django, and Railway. Django gave me a way to build a website, and Railway gave me somewhere to run it. I was learning how to use both while trying things out.

The early project was [AppOnRailway][railway-experiment], which I will call my Railway experiment here. Its inherited history begins with a [basic Django scaffold][template-start]. My own work grew beyond that starting point into experiments with accounts, chat, and file sharing. It was not a file-sharing product with a carefully planned development path.

In July 2023, I created [MyShareServer][my-share-server], an early dedicated sharing project. In December, I also created a private repository called `django-shareserver-neat`. I kept experimenting and reorganizing the work across those repositories.

One of those repositories stayed private for a reason that had little to do with protecting my code: I had accidentally committed environment secrets and pushed them to GitHub. Its README is quite direct:

> THIS REPO CONTAINS DATABASE PASSWORD
>
> DO NOT ENCLOSE TO PUBLIC

Removing a secret from the current file does not necessarily remove it from the repository's history. Even rewritten commits can remain accessible through other references, cached views, or copies. [GitHub documents those complications][github-secret-removal]. I did not want to spend my time working through all of them then, so I moved on to another repository.

There may have been a better way to handle the situation. At the time, this was the correction I chose so I could continue. It was not a carefully planned security exercise, and a new repository does not, by itself, invalidate a leaked credential.

By December 2024, I had moved the public work into [django-shareserver][django-server], which I will call the Django version. Its [first commit][public-start] records the reason for the separate repository: keeping tokens and passwords out of the public history.

## I also tried putting advertisements on it

I was frustrated by advertisements on other file-sharing websites, and later I tried adding them to my own project. The [AdSense commit][adsense-experiment] is from January 2026.

I wanted to know whether the project could make money. The answer was no.

I do not have a business success story to attach to that experiment. The service remained something I mainly used myself, with friends using it occasionally. Trying to earn money from it did not become the reason to keep it running.

## Waiting for my own website became annoying

The Django version worked, but deploying it took longer than I wanted. The process involved getting the source, preparing static files, handling database migrations, packaging the application, and deploying it. A build and deployment took about ten minutes in my setup.

Railway also had an app-sleeping feature for services that were not being used. When I returned to my own service after it had gone to sleep, I could wait about a minute before using it. That was especially irritating for a tool I opened because I wanted to transfer something at that moment.

Deploying a new version and waking an existing one are different operations. [Railway's documentation][railway-sleep] describes the delay when a sleeping service receives its first request. I cared about both waits: the time after changing the project, and the time before I could use it again.

I wanted the work of compiling the application to happen while building the container image, before deployment. Then the deployed application could be lightweight enough to start quickly.

I already knew the pages I needed and how the data should fit together from the Django version. I knew Go was used for web development. By then, I also had AI to help with the implementation.

In June 2026, my instruction was essentially:

> rewrite the entire project in Go

That became [shareserver][go-server], which I will call the Go version. It took several commits of iteration, rather than a single instruction producing a finished application, but it worked well.

The deployment step for the already-built Go image took about five seconds. Waking the service took about two seconds. Those are approximate timings from my own setup. The old ten-minute figure includes the build, while the five-second figure is deployment after the image is ready.

The wakeup difference alone changed how the service felt to use. I could open it, refresh once or twice, and get on with the transfer instead of waiting around for my own website.

## AI helped me build the part I could already describe

Speed was the first reason for the rewrite. Being able to implement the behavior I wanted became another reason to keep going.

In the Django version, I wanted the browser to hash a password before sending it to the server. Hashing produces a derived value instead of sending the password itself. I did not know enough JavaScript to implement the browser side the way I wanted.

I could enforce HTTPS, which protects the connection, but the server at the other end still received the original password. If the server wanted to log it, the encrypted connection would not prevent that. I wanted to change what reached the server in the first place.

With AI, I could describe the requirement and work through the implementation. My shorthand for what I wanted was:

> hash everything, salt everything, encrypt everything

That was an instruction about the direction of the design, not a complete security specification. I did not have to personally write every part of the implementation, but I still needed to check what it did. Asking for security is not the same as demonstrating it.

The useful change was that my limited JavaScript knowledge no longer stopped me from attempting the design. I could take something I understood as a user and ask for help making it work in the browser.

In the current [upload code][browser-upload], the browser packages and encrypts the material before uploading it. It also derives a value from the password rather than sending the plaintext password. The [encryption code][browser-crypto] performs those operations locally, and the server receives the encrypted payload and the information it needs to store it and control access.

That was much closer to what I had wanted from the beginning. Running the server should not automatically give its administrator the contents of every uploaded file.

## I wanted to give the server less to expose

My concern about retention did not disappear just because I was running the service myself. I could choose the expiration policy, but I also wanted retained files to be less useful without their passwords.

The server's job became storing encrypted material and returning it to an authorized client. Decryption happens on the client. An administrator does not get a separate way to open the contents just by being an administrator.

Railway's later [security incident][railway-incident] made that distinction feel particularly relevant. Its report describes an attack on October 20–21, 2026, including exposure of customer environment variables. My reaction was that I did not have easily readable personal material sitting on the server. I kept using the service.

That does not mean a compromised hosting provider cannot hurt me. There is a difference between someone copying encrypted stored files and someone controlling the website I open next. A host that can change the JavaScript it sends to my browser could try to capture a future password or upload before encryption. A weak password can also be guessed.

The server still holds [metadata][share-metadata], including titles, upload sizes, and uploader IP addresses. Encrypting the contents does not make all information about a transfer disappear. Expiration also cannot stop a recipient from keeping a copy.

I do not take those limits to mean that keeping encryption on the client is pointless. I wanted the server to hold less information worth stealing. That is a narrower goal than making the entire system immune to compromise, and it is the one I built around.

## Now I mostly just use it

I still use the service myself, and sometimes my friends use it too. It handles the transfers I need in daily life without the frustration that sent me looking for something else.

It did not become a source of income. It became a tool I use. I can choose how long an upload stays available, and the server does not need to read its contents to help me move it.

[railway-experiment]: https://github.com/ParkSnoopy/AppOnRailway
[template-start]: https://github.com/ParkSnoopy/AppOnRailway/commit/ab4136aa6dd48204089419bb49967500012f3bfb
[my-share-server]: https://github.com/ParkSnoopy/MyShareServer
[django-server]: https://github.com/ParkSnoopy/django-shareserver
[public-start]: https://github.com/ParkSnoopy/django-shareserver/commit/609af32e569133129614dd5ef6094d830a4b9f14
[github-secret-removal]: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
[adsense-experiment]: https://github.com/ParkSnoopy/django-shareserver/commit/483bf385
[railway-sleep]: https://docs.railway.com/deployments/serverless
[go-server]: https://github.com/ParkSnoopy/shareserver
[browser-upload]: https://github.com/ParkSnoopy/shareserver/blob/1c6753089339b738dd983e65086a6485be2ffb54/web/static/js/upload.js
[browser-crypto]: https://github.com/ParkSnoopy/shareserver/blob/1c6753089339b738dd983e65086a6485be2ffb54/web/static/js/crypto.js
[share-metadata]: https://github.com/ParkSnoopy/shareserver/blob/1c6753089339b738dd983e65086a6485be2ffb54/internal/ent/schema/share.go
[railway-incident]: https://blog.railway.com/p/incident-report-october-security-incident
